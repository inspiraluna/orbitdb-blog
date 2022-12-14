import React, { useEffect,useState }  from "react"
import { Link as ReachLink  } from 'react-router-dom'
import { Link,HStack,Tag,TagLabel } from '@chakra-ui/react'
import { observer } from 'mobx-react'
import Moment from 'react-moment';
import {log} from '../utils/loaderPrettyLog.js'
import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import CreatePost from "../components/CreatePost"
import ChakraUIRenderer from 'chakra-ui-markdown-renderer';
import ReactMarkdown from 'react-markdown'
import { CircularProgress } from '@chakra-ui/react'
import connectOrbit from '../orbitdb/connectOrbit'
import OrbitImageComponent from "../components/OrbitImageComponent";

const BlogIndex = (props) => {
  
  const runConnctOrbit = async (options) => await connectOrbit(props.store,options)
  const [tag, setTag] = useState();
  
  const getOrbitImageComponent = (otherProps) => {
    log.action('parsing markdown document for ipfs images ...')
    return (<OrbitImageComponent store={props.store} {...otherProps}/>)
  }

  useEffect(() => {

    props.store.currentPost = undefined
    log.action('loading index - current post ',props.store.currentPost?props.store.currentPost:'not given')
    if(props.match.params.tag!==undefined) setTag(props.match.params.tag)

    if(props.match.params.hash!==undefined){

        let dbName = props.match.params.hash;
        if(props.match.params.name!==undefined)
          dbName = dbName + '/' + props.match.params.name
        log.success('received dbName from url',dbName)
        props.store.setDbAddress(dbName)
        runConnctOrbit() //{repo:"./ipfs-repo-alt"}
        props.store.loadPosts().then(log.success('posts loaded'))
    }
  }, []);

  if (props.store.posts.length === 0) {
    return (
      <Layout location={props.location} store={props.store} title={process.env.TITLE}>
        <Seo title={process.env.TITLE} />
          {props.store.isOnline?'Loading posts or no posts found...':<CircularProgress isIndeterminate  />} 
        <Bio />
        <CreatePost {...props} />
      </Layout>
    )
  }
  
  return (
    <Layout location={props.location} store={props.store} title={process.env.TITLE}>
      <Seo title={process.env.TITLE} />
      <ol style={{ listStyle: `none` }}>
        {
          props.store.posts.slice()?.sort((a,b) => {return new Date(b.postDate) - new Date(a.postDate);})?.map((post,i) => {
          if(post.subject===undefined) return (<li key={"empty_"+i}>&nbsp;</li>) //for some reason elements stay undefined in stores array after deleting them
          const subject  = post.name || post.subject
          const slug = post.hash
          const postDate = post.postDate
          const photoCID = post.photoCID || "QmdhR6iJYDGVhBw5PQssgtLUC6aqJ6CzfwbiUYPXrDpSoi" 
          const tagsLowerCase = post.tags?.map( e => e.toLowerCase())
          if(tag!==undefined && (tagsLowerCase.indexOf(tag.toLowerCase())!==-1) || tag === undefined)
          return (
            <li key={slug}>
              <article 
                className="post-list-item"
                itemScope
                itemType="http://schema.org/Article"
              >
                <header>
                  <h2>
                    <Link as={ReachLink}  to={`${post.address}`} itemProp="url">
                      <span itemProp="headline">{subject}</span>
                    </Link>
                  </h2>
                  <Moment fromNow ago>{postDate}</Moment> ago &nbsp;<Moment date={postDate} format={"YYYY-MM-DD HH:mm:ss"}/>
                </header>
                <section>
                <HStack spacing={4}>
                  {
                    post.tags?.map((tagName) => (
                      <Tag
                        size={"md"}
                        key={tagName}
                        borderRadius="full"
                        variant="solid"
                        colorScheme="red"
                      ><TagLabel>{tagName}</TagLabel>
                      </Tag>
                      ))
                  }
                </HStack>
                <OrbitImageComponent store={props.store} src={photoCID} /> 
          {
            // <ReactMarkdown components={{ChakraUIRenderer, img: getOrbitImageComponent } }>{post.body}</ReactMarkdown>
          }
                </section>
              </article>
            </li>
          )
        })}
      </ol>
      <p>&nbsp;</p>
      <Bio />
      <CreatePost {...props} />
     
    </Layout>
  )
}

export default observer(BlogIndex) 